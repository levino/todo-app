/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3346940990")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "listRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= id",
    "updateRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= id",
    "viewRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3346940990")

  // update collection data
  unmarshal({
    "createRule": "",
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
