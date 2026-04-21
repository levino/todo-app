/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3789154723")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_children_group_name` ON `children` (`group`, `name`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3789154723")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
