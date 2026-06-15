/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "deleteRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "listRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "updateRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "viewRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2254914799")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": "",
    "updateRule": "",
    "viewRule": ""
  }, collection)

  return app.save(collection)
})
