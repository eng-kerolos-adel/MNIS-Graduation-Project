import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Everything persisted on-device for session continuity and offline emergency
/// access. Only the refresh token and small cached JSON blobs live here — the
/// access token itself is kept in memory only (see [ApiClient]) and is never
/// written to disk.
class SecureSessionStore {
  SecureSessionStore._();
  static final SecureSessionStore instance = SecureSessionStore._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(),
  );

  static const _kRefreshToken = 'mnis.refreshToken';
  static const _kEmergencyCache = 'mnis.emergencyCache';
  static const _kEmergencyCachedAt = 'mnis.emergencyCachedAt';
  static const _kProfileCache = 'mnis.profileCache';
  static const _kBiometricEnabled = 'mnis.biometricEnabled';

  Future<String?> readRefreshToken() => _storage.read(key: _kRefreshToken);
  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _kRefreshToken, value: token);
  Future<void> clearRefreshToken() => _storage.delete(key: _kRefreshToken);

  Future<void> cacheEmergencyCardJson(String json) async {
    await _storage.write(key: _kEmergencyCache, value: json);
    await _storage.write(
      key: _kEmergencyCachedAt,
      value: DateTime.now().toIso8601String(),
    );
  }

  Future<String?> readEmergencyCardJson() =>
      _storage.read(key: _kEmergencyCache);
  Future<DateTime?> readEmergencyCachedAt() async {
    final raw = await _storage.read(key: _kEmergencyCachedAt);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  Future<void> cacheProfileJson(String json) =>
      _storage.write(key: _kProfileCache, value: json);
  Future<String?> readProfileJson() => _storage.read(key: _kProfileCache);

  Future<bool> readBiometricEnabled() async =>
      (await _storage.read(key: _kBiometricEnabled)) == 'true';
  Future<void> writeBiometricEnabled(bool enabled) =>
      _storage.write(key: _kBiometricEnabled, value: enabled.toString());

  /// Called on logout / forced sign-out. Emergency cache is intentionally
  /// kept so the offline emergency card still works right after a sign-out
  /// (e.g. the phone is later used in an emergency); it is only replaced by
  /// a fresh login, never silently wiped.
  Future<void> clearSession() async {
    await _storage.delete(key: _kRefreshToken);
    await _storage.delete(key: _kProfileCache);
  }
}



