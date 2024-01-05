WITH
    tkc AS (
        SELECT
            tc.table_schema,
            tc.constraint_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                 ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                 ON ccu.constraint_name = tc.constraint_name
        WHERE
              tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
        ),
    table_info AS (
        SELECT
    c.table_name,
    c.data_type,
    c.column_name,
    c.is_nullable
FROM
    information_schema.columns c
WHERE
    c.table_schema::name = 'public'::name
        ),
    columns AS (

        SELECT
            table_name,
            JSONB_AGG(JSONB_BUILD_OBJECT('type', data_type, 'name', column_name)) AS columns
        FROM
            table_info ti
        GROUP BY
            table_name
        )
SELECT
    constraint_name,
    tkc.table_name,
    column_name,
    foreign_table_name,
    foreign_column_name,
    c.columns AS table_columns,
    c2.columns AS foreign_table_columns
FROM
     tkc
    JOIN columns c ON tkc.table_name = c.table_name
    JOIN columns c2 ON tkc.foreign_table_name = c2.table_name;

    