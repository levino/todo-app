/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 0,
        "min": 0,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_3789154723",
        "hidden": false,
        "id": "relation3714236955",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "child_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_9Wxa",
        "max": 0,
        "min": 0,
        "name": "child_name",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_YK3Y",
        "max": 0,
        "min": 0,
        "name": "child_color",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_3346940990",
        "hidden": false,
        "id": "_clone_558m",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "group_id",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "number3701867583",
        "max": null,
        "min": null,
        "name": "child_points_balance",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_2254914799",
        "hidden": false,
        "id": "relation2377515398",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "task_id",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_p6YH",
        "max": 0,
        "min": 0,
        "name": "task_title",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "_clone_vG2A",
        "max": null,
        "min": null,
        "name": "task_priority",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "_clone_Nzq3",
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
      },
      {
        "hidden": false,
        "id": "_clone_HhGh",
        "max": "",
        "min": "",
        "name": "task_due_date",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "_clone_ncT4",
        "name": "task_completed",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "_clone_gwOY",
        "max": "",
        "min": "",
        "name": "task_completed_at",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "_clone_byVQ",
        "max": "",
        "min": "",
        "name": "task_last_completed_at",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "_clone_tjtz",
        "max": 0,
        "min": 0,
        "name": "task_recurrence_type",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "_clone_R3qB",
        "max": null,
        "min": 0,
        "name": "task_points",
        "onlyInt": true,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      }
    ],
    "id": "pbc_4142202888",
    "indexes": [],
    "listRule": "",
    "name": "tasks_page_view",
    "system": false,
    "type": "view",
    "updateRule": null,
    "viewQuery": "SELECT\n  (c.id || '-' || COALESCE(t.id, 'none')) AS id,\n  c.id AS child_id,\n  c.name AS child_name,\n  c.color AS child_color,\n  c.\"group\" AS group_id,\n  CAST((SELECT SUM(pt.points) FROM point_transactions pt WHERE pt.child = c.id) AS REAL) AS child_points_balance,\n  t.id AS task_id,\n  t.title AS task_title,\n  t.priority AS task_priority,\n  t.timeOfDay AS task_time_of_day,\n  t.dueDate AS task_due_date,\n  t.completed AS task_completed,\n  t.completedAt AS task_completed_at,\n  t.lastCompletedAt AS task_last_completed_at,\n  t.recurrenceType AS task_recurrence_type,\n  t.points AS task_points\nFROM children c\nLEFT JOIN tasks t ON t.child = c.id",
    "viewRule": ""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4142202888");

  return app.delete(collection);
})
