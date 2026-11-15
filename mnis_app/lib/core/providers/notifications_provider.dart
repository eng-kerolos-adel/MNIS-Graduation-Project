import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../network/api_client.dart';
import '../models/models.dart';

part 'notifications_provider.g.dart';

@riverpod
class NotificationsNotifier extends _$NotificationsNotifier {
  @override
  Future<List<AppNotification>> build() async {
    final list = await ApiClient.instance.get(
      '/notifications',
      (json) => (json as List).map((x) => AppNotification.fromJson(x)).toList(),
    );
    return list;
  }

  Future<void> markRead(String id) async {
    await ApiClient.instance.patch('/notifications/$id/read', {}, (j) => j);
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
