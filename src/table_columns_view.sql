SELECT table_name,column_name,data_type
FROM
    information_schema.columns c
WHERE
    c.table_schema::name = 'public'::name;