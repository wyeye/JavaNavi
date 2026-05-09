package com.javanavi.db;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;

class JdbcIsolationCompatibilityTest {
    @Test
    void fallsBackToValidationQueryAndSyntheticIsolationForMysqlLikeDrivers() throws Exception {
        BrokenMysqlLikeConnection raw = new BrokenMysqlLikeConnection();
        Connection wrapped = JdbcIsolationCompatibility.wrap(raw, "mysql");

        assertThat(wrapped.isValid(1)).isTrue();
        assertThat(raw.executedValidationQuery).isEqualTo("SELECT 1");
        assertThat(wrapped.getTransactionIsolation()).isEqualTo(Connection.TRANSACTION_REPEATABLE_READ);

        wrapped.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
        assertThat(wrapped.getTransactionIsolation()).isEqualTo(Connection.TRANSACTION_READ_COMMITTED);
    }

    private static final class BrokenMysqlLikeConnection extends StubConnection {
        private boolean closed;
        private String executedValidationQuery;

        @Override
        public boolean isClosed() {
            return closed;
        }

        @Override
        public boolean isValid(int timeout) {
            closed = true;
            return false;
        }

        @Override
        public int getTransactionIsolation() throws SQLException {
            closed = true;
            throw new SQLException("Unsupported transaction isolation level '-1'");
        }

        @Override
        public void setTransactionIsolation(int level) throws SQLException {
            closed = true;
            throw new SQLException("Unsupported transaction isolation level '-1'");
        }

        @Override
        public Statement createStatement() {
            return new StubStatement() {
                @Override
                public boolean execute(String sql) {
                    executedValidationQuery = sql;
                    closed = false;
                    return true;
                }
            };
        }
    }

    private abstract static class StubConnection implements Connection {
        @Override public Statement createStatement() throws SQLException { throw new SQLException("not implemented"); }
        @Override public void close() {}
        @Override public boolean isClosed() { return false; }
        @Override public boolean isValid(int timeout) throws SQLException { return true; }
        @Override public void setReadOnly(boolean readOnly) {}
        @Override public boolean isReadOnly() { return false; }
        @Override public void setAutoCommit(boolean autoCommit) {}
        @Override public boolean getAutoCommit() { return true; }
        @Override public void setTransactionIsolation(int level) throws SQLException {}
        @Override public int getTransactionIsolation() throws SQLException { return Connection.TRANSACTION_READ_COMMITTED; }
        @Override public void setCatalog(String catalog) {}
        @Override public String getCatalog() { return null; }
        @Override public void setSchema(String schema) {}
        @Override public String getSchema() { return null; }
        @Override public void abort(Executor executor) {}
        @Override public void clearWarnings() {}
        @Override public <T> T unwrap(Class<T> iface) throws SQLException { throw new SQLException("unwrap"); }
        @Override public boolean isWrapperFor(Class<?> iface) { return false; }
        @Override public java.sql.CallableStatement prepareCall(String sql) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.PreparedStatement prepareStatement(String sql) throws SQLException { throw new SQLException("not implemented"); }
        @Override public String nativeSQL(String sql) { return sql; }
        @Override public void commit() {}
        @Override public void rollback() {}
        @Override public java.sql.DatabaseMetaData getMetaData() throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.SQLWarning getWarnings() { return null; }
        @Override public java.util.Map<String, Class<?>> getTypeMap() { return java.util.Map.of(); }
        @Override public void setTypeMap(java.util.Map<String, Class<?>> map) {}
        @Override public void setHoldability(int holdability) {}
        @Override public int getHoldability() { return 0; }
        @Override public java.sql.Savepoint setSavepoint() throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.Savepoint setSavepoint(String name) throws SQLException { throw new SQLException("not implemented"); }
        @Override public void rollback(java.sql.Savepoint savepoint) {}
        @Override public void releaseSavepoint(java.sql.Savepoint savepoint) {}
        @Override public Statement createStatement(int resultSetType, int resultSetConcurrency) throws SQLException { return createStatement(); }
        @Override public Statement createStatement(int resultSetType, int resultSetConcurrency, int resultSetHoldability) throws SQLException { return createStatement(); }
        @Override public java.sql.PreparedStatement prepareStatement(String sql, int resultSetType, int resultSetConcurrency) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.PreparedStatement prepareStatement(String sql, int resultSetType, int resultSetConcurrency, int resultSetHoldability) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.CallableStatement prepareCall(String sql, int resultSetType, int resultSetConcurrency) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.CallableStatement prepareCall(String sql, int resultSetType, int resultSetConcurrency, int resultSetHoldability) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.PreparedStatement prepareStatement(String sql, int autoGeneratedKeys) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.PreparedStatement prepareStatement(String sql, int[] columnIndexes) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.PreparedStatement prepareStatement(String sql, String[] columnNames) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.Clob createClob() throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.Blob createBlob() throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.NClob createNClob() throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.SQLXML createSQLXML() throws SQLException { throw new SQLException("not implemented"); }
        @Override public void setClientInfo(String name, String value) {}
        @Override public void setClientInfo(java.util.Properties properties) {}
        @Override public String getClientInfo(String name) { return null; }
        @Override public java.util.Properties getClientInfo() { return new java.util.Properties(); }
        @Override public java.sql.Array createArrayOf(String typeName, Object[] elements) throws SQLException { throw new SQLException("not implemented"); }
        @Override public java.sql.Struct createStruct(String typeName, Object[] attributes) throws SQLException { throw new SQLException("not implemented"); }
        @Override public void setNetworkTimeout(Executor executor, int milliseconds) {}
        @Override public int getNetworkTimeout() { return 0; }
        @Override public void beginRequest() {}
        @Override public void endRequest() {}
        @Override public boolean setShardingKeyIfValid(java.sql.ShardingKey shardingKey, java.sql.ShardingKey superShardingKey, int timeout) { return false; }
        @Override public void setShardingKey(java.sql.ShardingKey shardingKey, java.sql.ShardingKey superShardingKey) {}
        @Override public boolean setShardingKeyIfValid(java.sql.ShardingKey shardingKey, int timeout) { return false; }
        @Override public void setShardingKey(java.sql.ShardingKey shardingKey) {}
    }

    private abstract static class StubStatement implements Statement {
        @Override public boolean execute(String sql) throws SQLException { return false; }
        @Override public void close() {}
        @Override public void setQueryTimeout(int seconds) {}
        @Override public <T> T unwrap(Class<T> iface) throws SQLException { throw new SQLException("unwrap"); }
        @Override public boolean isWrapperFor(Class<?> iface) { return false; }
        @Override public java.sql.ResultSet executeQuery(String sql) throws SQLException { throw new SQLException("not implemented"); }
        @Override public int executeUpdate(String sql) throws SQLException { throw new SQLException("not implemented"); }
        @Override public int getMaxFieldSize() { return 0; }
        @Override public void setMaxFieldSize(int max) {}
        @Override public int getMaxRows() { return 0; }
        @Override public void setMaxRows(int max) {}
        @Override public void setEscapeProcessing(boolean enable) {}
        @Override public int getQueryTimeout() { return 0; }
        @Override public void cancel() {}
        @Override public java.sql.SQLWarning getWarnings() { return null; }
        @Override public void clearWarnings() {}
        @Override public void setCursorName(String name) {}
        @Override public java.sql.ResultSet getResultSet() { return null; }
        @Override public int getUpdateCount() { return 0; }
        @Override public boolean getMoreResults() { return false; }
        @Override public void setFetchDirection(int direction) {}
        @Override public int getFetchDirection() { return 0; }
        @Override public void setFetchSize(int rows) {}
        @Override public int getFetchSize() { return 0; }
        @Override public int getResultSetConcurrency() { return 0; }
        @Override public int getResultSetType() { return 0; }
        @Override public void addBatch(String sql) {}
        @Override public void clearBatch() {}
        @Override public int[] executeBatch() { return new int[0]; }
        @Override public Connection getConnection() { return null; }
        @Override public boolean getMoreResults(int current) { return false; }
        @Override public java.sql.ResultSet getGeneratedKeys() { return null; }
        @Override public int executeUpdate(String sql, int autoGeneratedKeys) throws SQLException { throw new SQLException("not implemented"); }
        @Override public int executeUpdate(String sql, int[] columnIndexes) throws SQLException { throw new SQLException("not implemented"); }
        @Override public int executeUpdate(String sql, String[] columnNames) throws SQLException { throw new SQLException("not implemented"); }
        @Override public boolean execute(String sql, int autoGeneratedKeys) throws SQLException { throw new SQLException("not implemented"); }
        @Override public boolean execute(String sql, int[] columnIndexes) throws SQLException { throw new SQLException("not implemented"); }
        @Override public boolean execute(String sql, String[] columnNames) throws SQLException { throw new SQLException("not implemented"); }
        @Override public int getResultSetHoldability() { return 0; }
        @Override public boolean isClosed() { return false; }
        @Override public void setPoolable(boolean poolable) {}
        @Override public boolean isPoolable() { return false; }
        @Override public void closeOnCompletion() {}
        @Override public boolean isCloseOnCompletion() { return false; }
        @Override public long getLargeUpdateCount() { return 0; }
        @Override public void setLargeMaxRows(long max) {}
        @Override public long getLargeMaxRows() { return 0; }
        @Override public long[] executeLargeBatch() { return new long[0]; }
        @Override public long executeLargeUpdate(String sql) throws SQLException { throw new SQLException("not implemented"); }
        @Override public long executeLargeUpdate(String sql, int autoGeneratedKeys) throws SQLException { throw new SQLException("not implemented"); }
        @Override public long executeLargeUpdate(String sql, int[] columnIndexes) throws SQLException { throw new SQLException("not implemented"); }
        @Override public long executeLargeUpdate(String sql, String[] columnNames) throws SQLException { throw new SQLException("not implemented"); }
        @Override public String enquoteLiteral(String val) { return val; }
        @Override public String enquoteIdentifier(String identifier, boolean alwaysQuote) { return identifier; }
        @Override public boolean isSimpleIdentifier(String identifier) { return true; }
        @Override public String enquoteNCharLiteral(String val) { return val; }
    }
}
