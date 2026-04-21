/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_tasks_child` ON `tasks` (`child`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
