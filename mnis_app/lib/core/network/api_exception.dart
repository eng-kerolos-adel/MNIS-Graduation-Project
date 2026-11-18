/// Thrown by [ApiClient] for any non-2xx response or network failure.
/// [code] is the backend's machine-readable error (e.g. INVALID_CREDENTIALS,
/// PASSWORD_CHANGE_REQUIRED) or one of the synthetic codes below.
class ApiException implements Exception {
  final int statusCode;
  final String code;
  const ApiException(this.statusCode, this.code);

  static const networkErrorCode = 'NETWORK_ERROR';
  static const unauthorizedCode = 'UNAUTHORIZED';

  bool get isNetworkError => statusCode == 0;
  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => 'ApiException($statusCode, $code)';
}
