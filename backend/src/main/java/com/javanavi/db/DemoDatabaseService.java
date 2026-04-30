package com.javanavi.db;

import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.ConnectionTestResultDto;
import com.javanavi.model.QueryRequestDto;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.TableSummaryDto;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.ResultSetMetaData;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class DemoDatabaseService {
    private final JdbcTemplate jdbcTemplate;
    private final I18nMessages messages;

    public DemoDatabaseService(JdbcTemplate jdbcTemplate, I18nMessages messages) {
        this.jdbcTemplate = jdbcTemplate;
        this.messages = messages;
    }

    @PostConstruct
    void initializeDemoSchema() {
        jdbcTemplate.execute("""
                create table if not exists demo_connections (
                    id varchar(64) primary key,
                    name varchar(120) not null,
                    driver_type varchar(40) not null,
                    created_at timestamp not null
                )
                """);
        Integer count = jdbcTemplate.queryForObject("select count(*) from demo_connections", Integer.class);
        if (count != null && count == 0) {
            jdbcTemplate.update(
                    "insert into demo_connections(id, name, driver_type, created_at) values (?, ?, ?, ?)",
                    "demo-h2", "Demo H2 Connection", "h2", Instant.parse("2026-04-28T00:00:00Z")
            );
            jdbcTemplate.update(
                    "insert into demo_connections(id, name, driver_type, created_at) values (?, ?, ?, ?)",
                    "demo-java", "Java Driver Pilot", "jdbc", Instant.parse("2026-04-28T00:05:00Z")
            );
        }
    }

    public ConnectionTestResultDto testConnection(ConnectionConfigDto config) {
        if (config == null || !config.isDemoConnection()) {
            String driverType = config == null ? "unknown" : config.driverType();
            return new ConnectionTestResultDto(
                    config == null ? null : config.id(),
                    driverType,
                    false,
                    messages.message("connection.demoOnly")
            );
        }
        Integer value = jdbcTemplate.queryForObject("select 1", Integer.class);
        boolean connected = value != null && value == 1;
        return new ConnectionTestResultDto(config.id(), config.driverType(), connected, connected ? messages.message("common.connectionSucceeded") : messages.message("connection.failed"));
    }

    public List<TableSummaryDto> listTables() {
        return jdbcTemplate.execute((ConnectionCallback<List<TableSummaryDto>>) connection -> {
            List<TableSummaryDto> tables = new ArrayList<>();
            try (var rs = connection.getMetaData().getTables(null, null, "%", new String[]{"TABLE"})) {
                while (rs.next()) {
                    String schema = rs.getString("TABLE_SCHEM");
                    String table = rs.getString("TABLE_NAME");
                    String type = rs.getString("TABLE_TYPE");
                    if ("INFORMATION_SCHEMA".equalsIgnoreCase(schema)) {
                        continue;
                    }
                    tables.add(new TableSummaryDto(schema, table, type));
                }
            }
            tables.sort((left, right) -> left.tableName().compareToIgnoreCase(right.tableName()));
            return tables;
        });
    }

    public <T> T withConnection(ConnectionCallback<T> callback) {
        return jdbcTemplate.execute(callback);
    }

    public QueryResultDto execute(QueryRequestDto request) {
        if (!request.connection().isDemoConnection()) {
            throw new IllegalArgumentException(messages.message("connection.demoOnly"));
        }
        String sql = request.sql().trim();
        if (!isReadOnlySelect(sql)) {
            throw new IllegalArgumentException(messages.message("query.readOnlySelectOnly"));
        }

        long started = System.nanoTime();
        int page = request.normalizedPage();
        int pageSize = request.normalizedPageSize();
        int offset = (page - 1) * pageSize;
        String pagedSql = sql + " limit " + pageSize + " offset " + offset;
        List<String> columns = new ArrayList<>();
        List<Map<String, Object>> rows = jdbcTemplate.query(pagedSql, tabularRowMapper(columns));
        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;

        return new QueryResultDto(columns, rows, rows.size(), page, pageSize, elapsedMs, true);
    }

    private static boolean isReadOnlySelect(String sql) {
        String normalized = sql.toLowerCase(Locale.ROOT).replaceFirst("^/\\*.*?\\*/", "").trim();
        return normalized.startsWith("select") || normalized.startsWith("with");
    }

    private static RowMapper<Map<String, Object>> tabularRowMapper(List<String> sharedColumns) {
        return (rs, rowNum) -> {
            ResultSetMetaData metadata = rs.getMetaData();
            int count = metadata.getColumnCount();
            if (sharedColumns.isEmpty()) {
                for (int index = 1; index <= count; index++) {
                    sharedColumns.add(metadata.getColumnLabel(index));
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int index = 1; index <= count; index++) {
                row.put(metadata.getColumnLabel(index), rs.getObject(index));
            }
            return row;
        };
    }
}
