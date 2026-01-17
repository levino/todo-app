package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/forms"
	"github.com/pocketbase/pocketbase/models"
)

func init() {
	// Register schedule generation job to run every 10 minutes
	apis.OnServe().Add(func(e *core.ServeEvent) error {
		scheduler := NewScheduleManager(e.App)
		
		// Start the background scheduler
		go scheduler.Start()
		
		log.Println("Schedule manager started - checking every 10 minutes")
		return nil
	})
}

type ScheduleManager struct {
	app *pocketbase.PocketBase
}

type Schedule struct {
	ID            string    `db:"id" json:"id"`
	Title         string    `db:"title" json:"title"`
	Child         string    `db:"child" json:"child"`
	Priority      *int      `db:"priority" json:"priority"`
	Recurrence    string    `db:"recurrence" json:"recurrence"`
	DaysOfWeek    []int     `db:"daysOfWeek" json:"daysOfWeek"`
	TimePeriod    string    `db:"timePeriod" json:"timePeriod"`
	Active        bool      `db:"active" json:"active"`
	LastGenerated time.Time `db:"lastGenerated" json:"lastGenerated"`
}

func NewScheduleManager(app *pocketbase.PocketBase) *ScheduleManager {
	return &ScheduleManager{app: app}
}

func (sm *ScheduleManager) Start() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	// Run immediately on start
	if err := sm.ProcessSchedules(); err != nil {
		log.Printf("Error processing schedules on startup: %v", err)
	}

	for {
		select {
		case <-ticker.C:
			if err := sm.ProcessSchedules(); err != nil {
				log.Printf("Error processing schedules: %v", err)
			}
		}
	}
}

func (sm *ScheduleManager) ProcessSchedules() error {
	// Get all active schedules
	schedules, err := sm.app.Dao().FindCollectionByNameOrId("schedules")
	if err != nil {
		return fmt.Errorf("failed to find schedules collection: %w", err)
	}

	records, err := sm.app.Dao().FindRecordsByFilter(schedules, "active = true", "", 0, 0, nil)
	if err != nil {
		return fmt.Errorf("failed to find active schedules: %w", err)
	}

	log.Printf("Processing %d active schedules", len(records))

	for _, record := range records {
		if err := sm.processSchedule(record); err != nil {
			log.Printf("Error processing schedule %s: %v", record.Id, err)
		}
	}

	return nil
}

func (sm *ScheduleManager) processSchedule(record *models.Record) error {
	// Parse schedule data
	schedule := Schedule{
		ID:         record.Id,
		Title:      record.GetString("title"),
		Child:      record.GetString("child"),
		Recurrence: record.GetString("recurrence"),
		TimePeriod: record.GetString("timePeriod"),
		Active:     record.GetBool("active"),
	}

	if priority := record.GetInt("priority"); priority != 0 {
		schedule.Priority = &priority
	}

	// Parse days of week for weekly schedules
	if daysJSON := record.GetString("daysOfWeek"); daysJSON != "" {
		if err := json.Unmarshal([]byte(daysJSON), &schedule.DaysOfWeek); err != nil {
			log.Printf("Failed to parse daysOfWeek for schedule %s: %v", schedule.ID, err)
		}
	}

	// Parse last generated time
	if lastGen := record.GetDateTime("lastGenerated").Time(); !lastGen.IsZero() {
		schedule.LastGenerated = lastGen
	}

	// Check if we need to generate a new task
	shouldGenerate, err := sm.shouldGenerateTask(schedule)
	if err != nil {
		return fmt.Errorf("failed to check if task should be generated: %w", err)
	}

	if !shouldGenerate {
		return nil
	}

	// Generate the task
	if err := sm.generateTask(schedule); err != nil {
		return fmt.Errorf("failed to generate task: %w", err)
	}

	// Update last generated time
	if err := sm.updateLastGenerated(record); err != nil {
		return fmt.Errorf("failed to update lastGenerated: %w", err)
	}

	log.Printf("Generated task for schedule %s (%s)", schedule.ID, schedule.Title)
	return nil
}

func (sm *ScheduleManager) shouldGenerateTask(schedule Schedule) (bool, error) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// For daily schedules: check if we haven't generated today
	if schedule.Recurrence == "daily" {
		lastGenDate := time.Date(schedule.LastGenerated.Year(), schedule.LastGenerated.Month(), schedule.LastGenerated.Day(), 0, 0, 0, 0, schedule.LastGenerated.Location())
		return today.After(lastGenDate), nil
	}

	// For weekly schedules: check if today is a scheduled day and we haven't generated today
	if schedule.Recurrence == "weekly" {
		currentWeekday := int(now.Weekday()) // 0 = Sunday, 6 = Saturday
		
		// Check if today is a scheduled day
		isScheduledDay := false
		if len(schedule.DaysOfWeek) == 0 {
			// No specific days means all days
			isScheduledDay = true
		} else {
			for _, day := range schedule.DaysOfWeek {
				if day == currentWeekday {
					isScheduledDay = true
					break
				}
			}
		}

		if !isScheduledDay {
			return false, nil
		}

		// Check if we already generated today
		lastGenDate := time.Date(schedule.LastGenerated.Year(), schedule.LastGenerated.Month(), schedule.LastGenerated.Day(), 0, 0, 0, 0, schedule.LastGenerated.Location())
		return today.After(lastGenDate), nil
	}

	return false, nil
}

func (sm *ScheduleManager) generateTask(schedule Schedule) error {
	// Check if there's already an incomplete task for this schedule and child
	tasksCollection, err := sm.app.Dao().FindCollectionByNameOrId("kiosk_tasks")
	if err != nil {
		return fmt.Errorf("failed to find tasks collection: %w", err)
	}

	// Look for existing incomplete tasks from this schedule
	existingTasks, err := sm.app.Dao().FindRecordsByFilter(
		tasksCollection,
		fmt.Sprintf("schedule = '%s' && child = '%s' && completed = false", schedule.ID, schedule.Child),
		"",
		0, 1, nil,
	)
	if err != nil {
		return fmt.Errorf("failed to check existing tasks: %w", err)
	}

	// If there's already an incomplete task, don't generate a new one
	if len(existingTasks) > 0 {
		log.Printf("Skipping task generation for schedule %s - incomplete task already exists", schedule.ID)
		return nil
	}

	// Create new task record
	form := forms.NewRecordUpsert(sm.app, &models.Record{})
	form.LoadRequest(map[string]any{
		"title":       schedule.Title,
		"child":       schedule.Child,
		"priority":    schedule.Priority,
		"completed":   false,
		"schedule":    schedule.ID,
		"generatedAt": time.Now().Format(time.RFC3339),
	}, "")

	// Validate and create the task
	if err := form.Submit(); err != nil {
		return fmt.Errorf("failed to create task: %w", err)
	}

	return nil
}

func (sm *ScheduleManager) updateLastGenerated(record *models.Record) error {
	form := forms.NewRecordUpsert(sm.app, record)
	form.LoadRequest(map[string]any{
		"lastGenerated": time.Now().Format(time.RFC3339),
	}, "")

	if err := form.Submit(); err != nil {
		return fmt.Errorf("failed to update lastGenerated: %w", err)
	}

	return nil
}