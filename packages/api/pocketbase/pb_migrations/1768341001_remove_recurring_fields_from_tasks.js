/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Remove recurring fields from kiosk_tasks since they now belong to schedules
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // Remove the recurring fields
  collection.fields.removeById("select_recurrence")
  collection.fields.removeById("json_daysOfWeek")
  collection.fields.removeById("select_timePeriod")

  // Add optional schedule reference for generated tasks
  collection.fields.push(new Field({
    "hidden": false,
    "id": "relation_schedule",
    "name": "schedule",
    "type": "relation",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "pbc_schedules",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1
    }
  }))

  // Add generatedAt field to track when the task was created from a schedule
  collection.fields.push(new Field({
    "hidden": false,
    "id": "datetime_generatedAt",
    "name": "generatedAt",
    "type": "date",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // Remove the new fields
  collection.fields.removeById("relation_schedule")
  collection.fields.removeById("datetime_generatedAt")

  // Restore the recurring fields
  collection.fields.push(new Field({
    "hidden": false,
    "id": "select_recurrence",
    "maxSelect": 1,
    "name": "recurrence",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["none", "daily", "weekly"]
  }))

  collection.fields.push(new Field({
    "hidden": false,
    "id": "json_daysOfWeek",
    "maxSize": 0,
    "name": "daysOfWeek",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  collection.fields.push(new Field({
    "hidden": false,
    "id": "select_timePeriod",
    "maxSelect": 1,
    "name": "timePeriod",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["morning", "afternoon", "evening"]
  }))

  return app.save(collection)
})