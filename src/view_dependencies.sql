WITH
    base AS (
        SELECT
            dependent_view.relname AS dependent_view,
            source_table.relname AS source_table,
            pg_attribute.attname AS column_name
        FROM
            pg_depend
            JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
            JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
            JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
            JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
                AND pg_depend.refobjsubid = pg_attribute.attnum
            JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
        WHERE
            source_ns.nspname = 'public'
        ),
    source_table_columns AS (
        SELECT
            dependent_view,
            source_table,
            JSONB_AGG(column_name) AS column_names
        FROM
            base
        GROUP BY
            dependent_view, source_table
        )
SELECT
    dependent_view,
    JSONB_OBJECT_AGG(source_table, column_names) AS source_tables
FROM
    source_table_columns
GROUP BY
    dependent_view;


-- WITH
--     view_deps AS
--         (
--             SELECT
--                 dependent_view.relname AS dependent_view,
--                 source_table.relname AS source_table,
--                 pg_attribute.attname AS column_name,
--                 CASE
--                     WHEN source_table.relkind = 'v' THEN 'view'
--                     WHEN source_table.relkind = 'r' THEN 'table'
--                     ELSE 'unknown' END AS table_type,
--                 c2.data_type AS data_type
--             FROM
--                 pg_depend
--                 JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
--                 JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
--                 JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
--                 JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
--                     AND pg_depend.refobjsubid = pg_attribute.attnum
--                 JOIN information_schema.columns c2 ON source_table.relname = c2.table_name
--             WHERE
--                 c2.table_schema = 'public'
--             ),
--     column_agg AS (
--         SELECT
--             v.dependent_view,
--             v.source_table,
--             v.table_type,
--             JSONB_AGG(JSONB_BUILD_OBJECT(
--                     'name', v.column_name,
--                     'type', v.data_type
--                       )) AS columns

--         FROM
--             view_deps v
--         GROUP BY
--             v.dependent_view, source_table, v.table_type
--         ),
--     final_agg AS (
--         SELECT
--             dependent_view name,
--             JSONB_AGG(JSONB_BUILD_OBJECT(
--                     'name', source_table,
--                     'type', table_type,
--                     'columns', columns
--                       )) AS tables
--         FROM
--             column_agg
--         GROUP BY
--             dependent_view
--         )
-- SELECT *
-- FROM
--     final_agg