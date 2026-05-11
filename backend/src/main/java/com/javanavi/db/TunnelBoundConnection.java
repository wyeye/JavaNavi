package com.javanavi.db;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;

final class TunnelBoundConnection implements InvocationHandler {
    private final Connection delegate;
    private final ConnectionNetworkTunnelService.TunnelLease tunnelLease;
    private volatile boolean closed;

    TunnelBoundConnection(Connection delegate, ConnectionNetworkTunnelService.TunnelLease tunnelLease) {
        this.delegate = delegate;
        this.tunnelLease = tunnelLease;
    }

    static Connection wrap(Connection delegate, ConnectionNetworkTunnelService.TunnelLease tunnelLease) {
        return (Connection) Proxy.newProxyInstance(
                Connection.class.getClassLoader(),
                new Class<?>[]{Connection.class},
                new TunnelBoundConnection(delegate, tunnelLease)
        );
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        if ("close".equals(method.getName()) && method.getParameterCount() == 0) {
            closeBoth();
            return null;
        }
        if ("isClosed".equals(method.getName()) && method.getParameterCount() == 0) {
            return closed || delegate.isClosed();
        }
        try {
            return method.invoke(delegate, args);
        } catch (java.lang.reflect.InvocationTargetException error) {
            throw error.getTargetException();
        }
    }

    private void closeBoth() throws SQLException {
        if (closed) {
            return;
        }
        closed = true;
        SQLException sqlError = null;
        try {
            delegate.close();
        } catch (SQLException error) {
            sqlError = error;
        } finally {
            tunnelLease.close();
        }
        if (sqlError != null) {
            throw sqlError;
        }
    }
}
