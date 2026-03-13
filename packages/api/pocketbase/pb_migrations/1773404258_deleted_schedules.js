/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1427126806");

  return app.delete(collection);
}, (app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "deleteRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text724990059",
        "max": 0,
        "min": 0,
        "name": "title",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_3789154723",
        "hidden": false,
        "id": "relation582177833",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "child",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text4233012455",
        "max": 0,
        "min": 0,
        "name": "scheduleType",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number2985260490",
        "max": null,
        "min": null,
        "name": "intervalDays",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "json2608074664",
        "maxSize": 0,
        "name": "scheduleDays",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "date1008021896",
        "max": "",
        "min": "",
        "name": "scheduledDate",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "number4034491878",
        "max": null,
        "min": null,
        "name": "taskPriority",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "bool1260321794",
        "name": "active",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_1427126806",
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "name": "schedules",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group",
    "viewRule": "@request.auth.id != \"\" && @collection.user_groups.user ?= @request.auth.id && @collection.user_groups.group ?= child.group"
  });

  return app.save(collection);
})
