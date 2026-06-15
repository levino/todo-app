/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4142202888")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  (c.id || '-' || COALESCE(t.id, 'none')) AS id,\n  c.id AS child_id,\n  c.name AS child_name,\n  c.color AS child_color,\n  c.\"group\" AS group_id,\n  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child = c.id) AS REAL) AS child_points_balance,\n  t.id AS task_id,\n  t.title AS task_title,\n  t.priority AS task_priority,\n  t.timeOfDay AS task_time_of_day,\n  t.dueDate AS task_due_date,\n  t.completed AS task_completed,\n  t.completedAt AS task_completed_at,\n  t.lastCompletedAt AS task_last_completed_at,\n  t.recurrenceType AS task_recurrence_type,\n  t.points AS task_points,\n  COALESCE(t.isChore, 0) AS task_is_chore\nFROM children c\nLEFT JOIN tasks t ON t.child = c.id"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_WzuH")

  // remove field
  collection.fields.removeById("_clone_b4SH")

  // remove field
  collection.fields.removeById("_clone_Ox6G")

  // remove field
  collection.fields.removeById("_clone_GlyX")

  // remove field
  collection.fields.removeById("_clone_JhcX")

  // remove field
  collection.fields.removeById("_clone_P7PF")

  // remove field
  collection.fields.removeById("_clone_frQS")

  // remove field
  collection.fields.removeById("_clone_ZfhN")

  // remove field
  collection.fields.removeById("_clone_h3kj")

  // remove field
  collection.fields.removeById("_clone_HT55")

  // remove field
  collection.fields.removeById("_clone_X5Nb")

  // remove field
  collection.fields.removeById("_clone_nI7O")

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_NUnv",
    "max": 0,
    "min": 0,
    "name": "child_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_L64g",
    "max": 0,
    "min": 0,
    "name": "child_color",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3346940990",
    "help": "",
    "hidden": false,
    "id": "_clone_6VSt",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "group_id",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_CDD6",
    "max": 0,
    "min": 0,
    "name": "task_title",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_JwoX",
    "max": null,
    "min": null,
    "name": "task_priority",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_ONVe",
    "maxSelect": 1,
    "name": "task_time_of_day",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "morning",
      "afternoon",
      "evening"
    ]
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_1bAe",
    "max": "",
    "min": "",
    "name": "task_due_date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_urss",
    "name": "task_completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_GZb7",
    "max": "",
    "min": "",
    "name": "task_completed_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_fR0P",
    "max": "",
    "min": "",
    "name": "task_last_completed_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_5xRy",
    "max": 0,
    "min": 0,
    "name": "task_recurrence_type",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_WCaI",
    "max": null,
    "min": 0,
    "name": "task_points",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(16, new Field({
    "help": "",
    "hidden": false,
    "id": "json2302947054",
    "maxSize": 1,
    "name": "task_is_chore",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4142202888")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  (c.id || '-' || COALESCE(t.id, 'none')) AS id,\n  c.id AS child_id,\n  c.name AS child_name,\n  c.color AS child_color,\n  c.\"group\" AS group_id,\n  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child = c.id) AS REAL) AS child_points_balance,\n  t.id AS task_id,\n  t.title AS task_title,\n  t.priority AS task_priority,\n  t.timeOfDay AS task_time_of_day,\n  t.dueDate AS task_due_date,\n  t.completed AS task_completed,\n  t.completedAt AS task_completed_at,\n  t.lastCompletedAt AS task_last_completed_at,\n  t.recurrenceType AS task_recurrence_type,\n  t.points AS task_points\nFROM children c\nLEFT JOIN tasks t ON t.child = c.id"
  }, collection)

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_WzuH",
    "max": 0,
    "min": 0,
    "name": "child_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_b4SH",
    "max": 0,
    "min": 0,
    "name": "child_color",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3346940990",
    "help": "",
    "hidden": false,
    "id": "_clone_Ox6G",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "group_id",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_GlyX",
    "max": 0,
    "min": 0,
    "name": "task_title",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_JhcX",
    "max": null,
    "min": null,
    "name": "task_priority",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_P7PF",
    "maxSelect": 1,
    "name": "task_time_of_day",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "morning",
      "afternoon",
      "evening"
    ]
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_frQS",
    "max": "",
    "min": "",
    "name": "task_due_date",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_ZfhN",
    "name": "task_completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_h3kj",
    "max": "",
    "min": "",
    "name": "task_completed_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_HT55",
    "max": "",
    "min": "",
    "name": "task_last_completed_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  // add field
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_X5Nb",
    "max": 0,
    "min": 0,
    "name": "task_recurrence_type",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(15, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_nI7O",
    "max": null,
    "min": 0,
    "name": "task_points",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // remove field
  collection.fields.removeById("_clone_NUnv")

  // remove field
  collection.fields.removeById("_clone_L64g")

  // remove field
  collection.fields.removeById("_clone_6VSt")

  // remove field
  collection.fields.removeById("_clone_CDD6")

  // remove field
  collection.fields.removeById("_clone_JwoX")

  // remove field
  collection.fields.removeById("_clone_ONVe")

  // remove field
  collection.fields.removeById("_clone_1bAe")

  // remove field
  collection.fields.removeById("_clone_urss")

  // remove field
  collection.fields.removeById("_clone_GZb7")

  // remove field
  collection.fields.removeById("_clone_fR0P")

  // remove field
  collection.fields.removeById("_clone_5xRy")

  // remove field
  collection.fields.removeById("_clone_WCaI")

  // remove field
  collection.fields.removeById("json2302947054")

  return app.save(collection)
})
