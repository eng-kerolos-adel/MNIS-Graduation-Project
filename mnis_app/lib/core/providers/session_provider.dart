import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';
import '../network/api_exception.dart';
import '../network/mnis_repository.dart';
import '../storage/secure_session_store.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient.instance);

final repositoryProvider = Provider<MnisRepository>(
  (ref) => MnisRepository(ref.watch(apiClientProvider)),
);

/// The single source of truth for "who is signed in". `null` means signed
/// out; the app should never show citizen data without going through this.
final sessionControllerProvider =
    AsyncNotifierProvider<SessionController, SessionUser?>(
  SessionController.new,
);

class SessionController extends AsyncNotifier<SessionUser?> {
  bool _wiredExpiryHook = false;

  @override
  Future<SessionUser?> build() async {
    if (!_wiredExpiryHook) {
      _wiredExpiryHook = true;
      // If a background refresh ever fails, drop the session synchronously
      // so the UI can navigate to login (see main_shell.dart's ref.listen).
      ref.read(apiClientProvider).onSessionExpired = () {
        SecureSessionStore.instance.clearSession();
        state = const AsyncData(null);
      };
    }
    return _restoreFromStorage();
  }

  Future<SessionUser?> _restoreFromStorage() async {
    final stored = await SecureSessionStore.instance.readRefreshToken();
    if (stored == null) return null;
    try {
      final repo = ref.read(repositoryProvider);
      final r = await repo.refresh(stored);
      ref.read(apiClientProvider).setAccessToken(r.accessToken);
      if (r.refreshToken != null) {
        await SecureSessionStore.instance.writeRefreshToken(r.refreshToken!);
      }
      return await repo.me();
    } on ApiException {
      await SecureSessionStore.instance.clearRefreshToken();
      return null;
    } catch (_) {
      // Network unreachable at startup: don't wipe the stored session, just
      // stay signed out for this launch — try again next time there's a signal.
      return null;
    }
  }

  /// Used by the biometric-unlock flow: re-validates the stored refresh
  /// token (does not prompt for a password) and updates [state].
  Future<SessionUser?> restoreForBiometric() async {
    state = const AsyncLoading();
    final user = await _restoreFromStorage();
    state = AsyncData(user);
    return user;
  }

  Future<SessionUser> login(String nationalId, String password) async {
    state = const AsyncLoading();
    final repo = ref.read(repositoryProvider);
    try {
      final r = await repo.login(nationalId, password);
      ref.read(apiClientProvider).setAccessToken(r.accessToken);
      if (r.refreshToken != null) {
        await SecureSessionStore.instance.writeRefreshToken(r.refreshToken!);
      }
      state = AsyncData(r.user);
      return r.user;
    } catch (e, st) {
      state = AsyncError(e, st);
      rethrow;
    }
  }

  Future<void> changePassword(String current, String next) async {
    await ref.read(repositoryProvider).changePassword(current, next);
    // The backend revokes every session on password change; mirror that locally.
    await logout();
  }

  Future<void> logout() async {
    final stored = await SecureSessionStore.instance.readRefreshToken();
    try {
      await ref.read(repositoryProvider).logout(stored);
    } catch (_) {
      /* best-effort: still clear locally even if the call fails offline */
    }
    ref.read(apiClientProvider).setAccessToken(null);
    await SecureSessionStore.instance.clearSession();
    state = const AsyncData(null);
  }

  /// Re-fetches `/auth/me` (e.g. after nothing changed but you want to be sure).
  Future<void> refreshUser() async {
    try {
      final user = await ref.read(repositoryProvider).me();
      state = AsyncData(user);
    } catch (_) {
      /* keep whatever we had */
    }
  }
}


