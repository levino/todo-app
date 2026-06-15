/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1980370882")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_point_transactions_child` ON `point_transactions` (`child`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1980370882")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
