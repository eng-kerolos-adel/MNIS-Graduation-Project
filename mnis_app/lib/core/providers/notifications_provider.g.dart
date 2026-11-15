// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notifications_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(NotificationsNotifier)
final notificationsProvider = NotificationsNotifierProvider._();

final class NotificationsNotifierProvider extends $AsyncNotifierProvider<
    NotificationsNotifier, List<AppNotification>> {
  NotificationsNotifierProvider._()
      : super(
          from: null,
          argument: null,
          retry: null,
          name: r'notificationsProvider',
          isAutoDispose: true,
          dependencies: null,
          $allTransitiveDependencies: null,
        );

  @override
  String debugGetCreateSourceHash() => _$notificationsNotifierHash();

  @$internal
  @override
  NotificationsNotifier create() => NotificationsNotifier();
}

String _$notificationsNotifierHash() =>
    r'43bf56a03008566ba5de3fae850ce916c93e0468';

abstract class _$NotificationsNotifier
    extends $AsyncNotifier<List<AppNotification>> {
  FutureOr<List<AppNotification>> build();
  @$mustCallSuper
  @override
  void runBuild() {
    final ref = this.ref
        as $Ref<AsyncValue<List<AppNotification>>, List<AppNotification>>;
    final element = ref.element as $ClassProviderElement<
        AnyNotifier<AsyncValue<List<AppNotification>>, List<AppNotification>>,
        AsyncValue<List<AppNotification>>,
        Object?,
        Object?>;
    element.handleCreate(ref, build);
  }
}
