/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "select3505938190",
    "maxSelect": 1,
    "name": "timeOfDay",
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "select3505938190",
    "maxSelect": 1,
    "name": "timeOfDay",
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

  return app.save(collection)
})
