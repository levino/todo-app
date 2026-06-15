/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1707999545")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && (user = @request.auth.id || @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group)"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1707999545")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= group"
  }, collection)

  return app.save(collection)
})
