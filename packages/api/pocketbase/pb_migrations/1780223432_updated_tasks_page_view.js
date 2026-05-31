/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4142202888")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  (c.id || '-' || COALESCE(t.id, 'none')) AS id,\n  c.id AS child_id,\n  c.name AS child_name,\n  c.color AS child_color,\n  c.\"group\" AS group_id,\n  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child = c.id) AS REAL) AS child_points_balance,\n  t.id AS task_id,\n  t.title AS task_title,\n  t.priority AS task_priority,\n  t.timeOfDay AS task_time_of_day,\n  t.dueDate AS task_due_date,\n  t.completed AS task_completed,\n  t.completedAt AS task_completed_at,\n  t.lastCompletedAt AS task_last_completed_at,\n  t.recurrenceType AS task_recurrence_type,\n  t.points AS task_points,\n  t.isChore AS task_is_chore,\n  t.dailyOnly AS task_daily_only\nFROM children c\nLEFT JOIN tasks t ON t.child = c.id"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_Nzay")

  // remove field
  collection.fields.removeById("_clone_zmdH")

  // remove field
  collection.fields.removeById("_clone_DoCL")

  // remove field
  collection.fields.removeById("_clone_lPZd")

  // remove field
  collection.fields.removeById("_clone_VI0x")

  // remove field
  collection.fields.removeById("_clone_0rXd")

  // remove field
  collection.fields.removeById("_clone_uurt")

  // remove field
  collection.fields.removeById("_clone_wksu")

  // remove field
  collection.fields.removeById("_clone_dsG1")

  // remove field
  collection.fields.removeById("_clone_wS2S")

  // remove field
  collection.fields.removeById("_clone_g5Pz")

  // remove field
  collection.fields.removeById("_clone_91ed")

  // remove field
  collection.fields.removeById("_clone_dbdZ")

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_XfQR",
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
    "id": "_clone_qU6g",
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
    "id": "_clone_eqxw",
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
    "id": "_clone_Gq2k",
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
    "id": "_clone_s26h",
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
    "id": "_clone_mryo",
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
    "id": "_clone_mxh3",
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
    "id": "_clone_ZhrN",
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
    "id": "_clone_DQZ6",
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
    "id": "_clone_H6Ey",
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
    "id": "_clone_hEN0",
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
    "id": "_clone_GaA5",
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
    "id": "_clone_CwrP",
    "name": "task_is_chore",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(17, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_fqWv",
    "name": "task_daily_only",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4142202888")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  (c.id || '-' || COALESCE(t.id, 'none')) AS id,\n  c.id AS child_id,\n  c.name AS child_name,\n  c.color AS child_color,\n  c.\"group\" AS group_id,\n  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child = c.id) AS REAL) AS child_points_balance,\n  t.id AS task_id,\n  t.title AS task_title,\n  t.priority AS task_priority,\n  t.timeOfDay AS task_time_of_day,\n  t.dueDate AS task_due_date,\n  t.completed AS task_completed,\n  t.completedAt AS task_completed_at,\n  t.lastCompletedAt AS task_last_completed_at,\n  t.recurrenceType AS task_recurrence_type,\n  t.points AS task_points,\n  t.isChore AS task_is_chore\nFROM children c\nLEFT JOIN tasks t ON t.child = c.id"
  }, collection)

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "_clone_Nzay",
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
    "id": "_clone_zmdH",
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
    "id": "_clone_DoCL",
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
    "id": "_clone_lPZd",
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
    "id": "_clone_VI0x",
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
    "id": "_clone_0rXd",
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
    "id": "_clone_uurt",
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
    "id": "_clone_wksu",
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
    "id": "_clone_dsG1",
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
    "id": "_clone_wS2S",
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
    "id": "_clone_g5Pz",
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
    "id": "_clone_91ed",
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
    "id": "_clone_dbdZ",
    "name": "task_is_chore",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // remove field
  collection.fields.removeById("_clone_XfQR")

  // remove field
  collection.fields.removeById("_clone_qU6g")

  // remove field
  collection.fields.removeById("_clone_eqxw")

  // remove field
  collection.fields.removeById("_clone_Gq2k")

  // remove field
  collection.fields.removeById("_clone_s26h")

  // remove field
  collection.fields.removeById("_clone_mryo")

  // remove field
  collection.fields.removeById("_clone_mxh3")

  // remove field
  collection.fields.removeById("_clone_ZhrN")

  // remove field
  collection.fields.removeById("_clone_DQZ6")

  // remove field
  collection.fields.removeById("_clone_H6Ey")

  // remove field
  collection.fields.removeById("_clone_hEN0")

  // remove field
  collection.fields.removeById("_clone_GaA5")

  // remove field
  collection.fields.removeById("_clone_CwrP")

  // remove field
  collection.fields.removeById("_clone_fqWv")

  return app.save(collection)
})
