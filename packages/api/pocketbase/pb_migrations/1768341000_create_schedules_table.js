/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Create schedules collection using individual field approach for proper ID generation
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

  // Add fields individually to ensure proper ID handling
  collection.fields.push(new Field({
    "id": "text_title",
    "name": "title",
    "type": "text",
    "system": false,
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "min": 1,
      "max": 255
    }
  }))

  collection.fields.push(new Field({
    "id": "relation_child",
    "name": "child",
    "type": "relation",
    "system": false,
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "pbc_3789154723",
      "cascadeDelete": true,
      "minSelect": null,
      "maxSelect": 1
    }
  }))

  collection.fields.push(new Field({
    "id": "number_priority",
    "name": "priority",
    "type": "number",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": true
    }
  }))

  collection.fields.push(new Field({
    "id": "select_recurrence",
    "name": "recurrence",
    "type": "select",
    "system": false,
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": ["daily", "weekly"]
    }
  }))

  collection.fields.push(new Field({
    "id": "json_daysOfWeek",
    "name": "daysOfWeek",
    "type": "json",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 0
    }
  }))

  collection.fields.push(new Field({
    "id": "select_timePeriod",
    "name": "timePeriod",
    "type": "select",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSelect": 1,
      "values": ["morning", "afternoon", "evening"]
    }
  }))

  collection.fields.push(new Field({
    "id": "bool_active",
    "name": "active",
    "type": "bool",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  collection.fields.push(new Field({
    "id": "datetime_lastGenerated",
    "name": "lastGenerated",
    "type": "date",
    "system": false,
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("schedules")
  return app.delete(collection)
})