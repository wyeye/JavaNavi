package com.javanavi.driver;

import java.io.IOException;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.List;
import java.util.Objects;

final class SingleProxySelector extends ProxySelector {
    private final Proxy proxy;

    SingleProxySelector(Proxy proxy) {
        this.proxy = Objects.requireNonNull(proxy, "proxy");
    }

    @Override
    public List<Proxy> select(URI uri) {
        return List.of(proxy);
    }

    @Override
    public void connectFailed(URI uri, SocketAddress sa, IOException ioe) {
        // HttpClient surfaces the request failure to the caller.
    }
}
