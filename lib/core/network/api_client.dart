import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config/env.dart';
import '../storage/secure_session_store.dart';
import 'api_exception.dart';

typedef JsonMap = Map<String, dynamic>;

/// Talks to the MNIS API as a mobile client: the access token is kept in
/// memory only, the refresh token is persisted (encrypted) and sent in the
/// JSON body — there is no cookie here, unlike the web portal.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  final http.Client _http = http.Client();
  String? _accessToken;
  Future<bool>? _refreshing;

  /// Called whenever a refresh attempt fails (session is truly gone), so the
  /// UI can drop the user back to the login screen. Set by the session
  /// controller at app start.
  void Function()? onSessionExpired;

  void setAccessToken(String? token) => _accessToken = token;
  bool get hasAccessToken => _accessToken != null;

  Uri _uri(String path) => Uri.parse('${Env.apiBaseUrl}/v1$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
      };

  Future<T> get<T>(String path, T Function(dynamic json) parse) =>
      _send('GET', path, null, parse);

  Future<T> delete<T>(String path, T Function(dynamic json) parse) =>
      _send('DELETE', path, null, parse);

  Future<T> post<T>(
    String path,
    Object? body,
    T Function(dynamic json) parse,
  ) =>
      _send('POST', path, body, parse);

  Future<T> patch<T>(
    String path,
    Object? body,
    T Function(dynamic json) parse,
  ) =>
      _send('PATCH', path, body, parse);

  Future<T> _send<T>(
    String method,
    String path,
    Object? body,
    T Function(dynamic json) parse, {
    bool isRetry = false,
  }) async {
    late final http.Response res;
    try {
      final req = http.Request(method, _uri(path))
        ..headers.addAll(_headers);
      if (body != null) req.body = jsonEncode(body);
      final streamed = await _http.send(req).timeout(
            const Duration(seconds: 20),
          );
      res = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException(0, ApiException.networkErrorCode);
    } catch (_) {
      throw const ApiException(0, ApiException.networkErrorCode);
    }

    if (res.statusCode == 401 && !isRetry && path != '/auth/login') {
      final refreshed = await _refreshOnce();
      if (refreshed) {
        return _send(method, path, body, parse, isRetry: true);
      }
      onSessionExpired?.call();
      throw const ApiException(401, ApiException.unauthorizedCode);
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, _extractErrorCode(res.body));
    }

    if (res.statusCode == 204 || res.body.isEmpty) return parse(null);
    return parse(jsonDecode(utf8.decode(res.bodyBytes)));
  }

  String _extractErrorCode(String body) {
    try {
      final decoded = jsonDecode(body);
      final message = decoded is Map ? decoded['message'] : null;
      if (message is List && message.isNotEmpty) return message.join(', ');
      if (message is String) return message;
    } catch (_) {
      /* non-JSON error body */
    }
    return 'ERROR';
  }

  /// Concurrent 401s share one refresh call — refresh tokens rotate on use,
  /// so firing several at once would invalidate each other.
  Future<bool> _refreshOnce() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final stored = await SecureSessionStore.instance.readRefreshToken();
    if (stored == null) return false;
    try {
      final req = http.Request('POST', _uri('/auth/refresh'))
        ..headers.addAll({'Content-Type': 'application/json'})
        ..body = jsonEncode({'refreshToken': stored});
      final streamed = await _http.send(req).timeout(const Duration(seconds: 15));
      final res = await http.Response.fromStream(streamed);
      if (res.statusCode != 200) return false;
      final data = jsonDecode(utf8.decode(res.bodyBytes)) as JsonMap;
      _accessToken = data['accessToken'] as String;
      final newRefresh = data['refreshToken'] as String?;
      if (newRefresh != null) {
        await SecureSessionStore.instance.writeRefreshToken(newRefresh);
      }
      return true;
    } catch (_) {
      return false;
    }
  }
}


