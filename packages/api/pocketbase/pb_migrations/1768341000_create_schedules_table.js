/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Create schedules collection
  const collection = new Collection({
    "name": "schedules",
    "type": "base",
    "system": false,
    "schema": [],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  })

  // Add title field
  collection.fields.push(new Field({
    "hidden": false,
    "id": "text_title",
    "name": "title",
    "type": "text",
    "system": false,
    "required": true,
    "presentable": false,
    "unique": false,
    "min": 1,
    "max": 255
  }))

  // Find children collection dynamically
  const childrenCollection = app.findCollectionByNameOrId("children")
  if (!childrenCollection) {
    throw new Error("Children collection not found")
  }

  // Add child relation field  
  collection.fields.push(new Field({
    "hidden": false,
    "id": "relation_child",
    "name": "child",
    "type": "relation",
    "system": false,
    "required": true,
    "presentable": false,
    "unique": false,
    "collectionId": childrenCollection.id,
    "cascadeDelete": true,
    "minSelect": null,
    "maxSelect": 1
  }))

  // Add priority field
  collection.fields.push(new Field({
    "hidden": false,
    "id": "number_priority",
    "name": "priority",
    "type": "number",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "min": null,
    "max": null,
    "noDecimal": true
  }))

  // Add recurrence field
  collection.fields.push(new Field({
    "hidden": false,
    "id": "select_recurrence",
    "name": "recurrence",
    "type": "select",
    "system": false,
    "required": true,
    "presentable": false,
    "unique": false,
    "maxSelect": 1,
    "values": ["daily", "weekly"]
  }))

  // Add daysOfWeek field  
  collection.fields.push(new Field({
    "hidden": false,
    "id": "json_daysOfWeek",
    "name": "daysOfWeek",
    "type": "json",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "maxSize": 0
  }))

  // Add timePeriod field
  collection.fields.push(new Field({
    "hidden": false,
    "id": "select_timePeriod",
    "name": "timePeriod",
    "type": "select",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "maxSelect": 1,
    "values": ["morning", "afternoon", "evening"]
  }))

  // Add active field
  collection.fields.push(new Field({
    "hidden": false,
    "id": "bool_active",
    "name": "active",
    "type": "bool",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false
  }))

  // Add lastGenerated field
  collection.fields.push(new Field({
    "hidden": false,
    "id": "datetime_lastGenerated",
    "name": "lastGenerated",
    "type": "date",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("schedules")
  return app.delete(collection)
})