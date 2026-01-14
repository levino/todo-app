/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3789154723")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "deleteRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "listRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "updateRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "viewRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3789154723")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
