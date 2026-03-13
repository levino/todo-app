/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Set existing tasks without timeOfDay to 'afternoon' (the general/default phase)
  app.db().newQuery("UPDATE tasks SET timeOfDay = 'afternoon' WHERE timeOfDay = '' OR timeOfDay IS NULL").execute()
}, (app) => {
  // Rollback: clear timeOfDay for tasks that were set to afternoon by this migration
  // (cannot distinguish between manually set and migrated, so this is a no-op)
})
