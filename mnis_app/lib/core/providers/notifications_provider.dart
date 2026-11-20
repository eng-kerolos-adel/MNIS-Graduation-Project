import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../models/models.dart';
import 'session_provider.dart';

part 'notifications_provider.g.dart';

@riverpod
class NotificationsNotifier extends _$NotificationsNotifier {
  @override
  Future<List<AppNotification>> build() async {
    final uid = ref.watch(sessionControllerProvider).value?.id;
    if (uid == null) return const [];
    return ref.watch(repositoryProvider).notifications();
  }

  Future<void> markRead(String id) async {
    await ref.read(repositoryProvider).markNotificationRead(id);
    final state = await future;
    this.state = AsyncValue.data(
      state.map((n) {
        if (n.id == id) {
          return AppNotification(
            id: n.id,
            title: n.title,
            body: n.body,
            sentAt: n.sentAt,
            data: n.data,
            readAt: DateTime.now(),
          );
        }
        return n;
      }).toList(),
    );
  }
}
