/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4142202888")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT\n  (c.id || '-' || COALESCE(t.id, 'none')) AS id,\n  c.id AS child_id,\n  c.name AS child_name,\n  c.color AS child_color,\n  c.\"group\" AS group_id,\n  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child = c.id) AS REAL) AS child_points_balance,\n  t.id AS task_id,\n  t.title AS task_title,\n  t.priority AS task_priority,\n  t.timeOfDay AS task_time_of_day,\n  t.dueDate AS task_due_date,\n  t.completed AS task_completed,\n  t.completedAt AS task_completed_at,\n  t.lastCompletedAt AS task_last_completed_at,\n  t.recurrenceType AS task_recurrence_type,\n  CAST(t.recurrenceInterval AS REAL) AS task_recurrence_interval,\n  CAST(t.recurrenceDays AS TEXT) AS task_recurrence_days,\n  t.points AS task_points,\n  t.isChore AS task_is_chore\nFROM children c\nLEFT JOIN tasks t ON t.child = c.id"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_Lri4")

  // remove field
  collection.fields.removeById("_clone_OvBI")

  // remove field
  collection.fields.removeById("_clone_V4b5")

  // remove field
  collection.fields.removeById("_clone_qRqO")

  // remove field
  collection.fields.removeById("_clone_KxT3")

  // remove field
  collection.fields.removeById("_clone_ygo7")

  // remove field
  collection.fields.removeById("_clone_bNT7")

  // remove field
  collection.fields.removeById("_clone_wP49")

  // remove field
  collection.fields.removeById("_clone_PXAY")

  // remove field
  collection.fields.removeById("_clone_LlyC")

  // remove field
  collection.fields.removeById("_clone_eerD")

  // remove field
  collection.fields.removeById("_clone_HcST")

  // remove field
  collection.fields.removeById("_clone_Ncms")

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_PJhL",
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
    "hidden": false,
    "id": "_clone_rE0b",
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
    "hidden": false,
    "id": "_clone_d467",
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
    "hidden": false,
    "id": "_clone_uWLn",
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
    "hidden": false,
    "id": "_clone_YK6i",
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
    "hidden": false,
    "id": "_clone_SLna",
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
    "hidden": false,
    "id": "_clone_7vgW",
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
    "hidden": false,
    "id": "_clone_hzOA",
    "name": "task_completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "_clone_hc9K",
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
    "hidden": false,
    "id": "_clone_EWNB",
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
    "hidden": false,
    "id": "_clone_AAMW",
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
    "hidden": false,
    "id": "number1700280617",
    "max": null,
    "min": null,
    "name": "task_recurrence_interval",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(16, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text758195681",
    "max": 0,
    "min": 0,
    "name": "task_recurrence_days",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "_clone_sMfc",
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
  collection.fields.addAt(18, new Field({
    "hidden": false,
    "id": "_clone_G40h",
    "name": "task_is_chore",
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
    "hidden": false,
    "id": "_clone_Lri4",
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
    "hidden": false,
    "id": "_clone_OvBI",
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
    "hidden": false,
    "id": "_clone_V4b5",
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
    "hidden": false,
    "id": "_clone_qRqO",
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
    "hidden": false,
    "id": "_clone_KxT3",
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
    "hidden": false,
    "id": "_clone_ygo7",
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
    "hidden": false,
    "id": "_clone_bNT7",
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
    "hidden": false,
    "id": "_clone_wP49",
    "name": "task_completed",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "_clone_PXAY",
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
    "hidden": false,
    "id": "_clone_LlyC",
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
    "hidden": false,
    "id": "_clone_eerD",
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
    "hidden": false,
    "id": "_clone_HcST",
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
    "hidden": false,
    "id": "_clone_Ncms",
    "name": "task_is_chore",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // remove field
  collection.fields.removeById("_clone_PJhL")

  // remove field
  collection.fields.removeById("_clone_rE0b")

  // remove field
  collection.fields.removeById("_clone_d467")

  // remove field
  collection.fields.removeById("_clone_uWLn")

  // remove field
  collection.fields.removeById("_clone_YK6i")

  // remove field
  collection.fields.removeById("_clone_SLna")

  // remove field
  collection.fields.removeById("_clone_7vgW")

  // remove field
  collection.fields.removeById("_clone_hzOA")

  // remove field
  collection.fields.removeById("_clone_hc9K")

  // remove field
  collection.fields.removeById("_clone_EWNB")

  // remove field
  collection.fields.removeById("_clone_AAMW")

  // remove field
  collection.fields.removeById("number1700280617")

  // remove field
  collection.fields.removeById("text758195681")

  // remove field
  collection.fields.removeById("_clone_sMfc")

  // remove field
  collection.fields.removeById("_clone_G40h")

  return app.save(collection)
})
