/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1427126806")

  // remove field
  collection.fields.removeById("select_recurrence")

  // remove field
  collection.fields.removeById("json_daysOfWeek")

  // remove field
  collection.fields.removeById("select_timePeriod")

  // add field
  collection.fields.addAt(6, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text399311096",
    "max": 100,
    "min": 0,
    "name": "cron",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "number2985260490",
    "max": 365,
    "min": 1,
    "name": "intervalDays",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1427126806")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select_recurrence",
    "maxSelect": 1,
    "name": "recurrence",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "daily",
      "weekly"
    ]
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json_daysOfWeek",
    "maxSize": 0,
    "name": "daysOfWeek",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "select_timePeriod",
    "maxSelect": 1,
    "name": "timePeriod",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "morning",
      "afternoon",
      "evening"
    ]
  }))

  // remove field
  collection.fields.removeById("text399311096")

  // remove field
  collection.fields.removeById("number2985260490")

  return app.save(collection)
})
