/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // add field
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

  app.save(collection)

  // Set existing tasks to afternoon (the general/default phase)
  app.db().newQuery("UPDATE tasks SET timeOfDay = 'afternoon' WHERE timeOfDay = '' OR timeOfDay IS NULL").execute()
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // remove field
  collection.fields.removeById("select3505938190")

  return app.save(collection)
})
