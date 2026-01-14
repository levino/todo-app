/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1707999545")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "deleteRule": "@request.auth.id = user || @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "listRule": "@request.auth.id = user || @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group",
    "viewRule": "@request.auth.id = user || @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1707999545")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id = user",
    "listRule": "@request.auth.id = user",
    "viewRule": "@request.auth.id = user"
  }, collection)

  return app.save(collection)
})
