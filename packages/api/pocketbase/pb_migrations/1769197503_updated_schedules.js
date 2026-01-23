/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1427126806")

  // remove field
  collection.fields.removeById("text399311096")

  // remove field
  collection.fields.removeById("text1872009285")

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "select224269848",
    "maxSelect": 1,
    "name": "timePeriod",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "morning",
      "afternoon",
      "evening"
    ]
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "json743520800",
    "maxSize": 500,
    "name": "daysOfWeek",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1427126806")

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
  collection.fields.addAt(8, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1872009285",
    "max": 5,
    "min": 0,
    "name": "time",
    "pattern": "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("select224269848")

  // remove field
  collection.fields.removeById("json743520800")

  return app.save(collection)
})
