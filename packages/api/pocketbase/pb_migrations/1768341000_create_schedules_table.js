/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Create schedules collection
  const collection = new Collection({
    "id": "pbc_schedules",
    "name": "schedules",
    "type": "base",
    "system": false,
    "schema": [
      {
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
      },
      {
        "id": "relation_child",
        "name": "child",
        "type": "relation",
        "system": false,
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "collectionId": "pbc_2254914799",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1
        }
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
        "id": "bool_active",
        "name": "active",
        "type": "bool",
        "system": false,
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      },
      {
        "id": "datetime_lastGenerated",
        "name": "lastGenerated",
        "type": "date",
        "system": false,
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_schedules")
  return app.delete(collection)
})