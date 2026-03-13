/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update collection data
  unmarshal({
    "name": "tasks"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update collection data
  unmarshal({
    "name": "kiosk_tasks"
  }, collection)

  return app.save(collection)
})
