/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "date1556740580",
    "max": "",
    "min": "",
    "name": "visibleFrom",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // remove field
  collection.fields.removeById("date1556740580")

  return app.save(collection)
})
