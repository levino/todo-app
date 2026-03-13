/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // add field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "date2782766",
    "max": "",
    "min": "",
    "name": "previousDueDate",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // remove field
  collection.fields.removeById("date2782766")

  return app.save(collection)
})
