import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A contact the citizen chooses to show on their emergency card. This is
/// purely local — MNIS does not have a "next of kin" field yet — so it lives
/// on-device only via SharedPreferences (not secret, so no need for secure
/// storage), and is not synced anywhere.
class EmergencyContact {
  final String name;
  final String phone;
  const EmergencyContact(this.name, this.phone);

  Map<String, String> toJson() => {'name': name, 'phone': phone};
  factory EmergencyContact.fromJson(Map<String, dynamic> j) =>
      EmergencyContact(j['name'] as String, j['phone'] as String);
}

const _kKey = 'mnis.emergencyContacts';

class EmergencyContactsNotifier extends StateNotifier<List<EmergencyContact>> {
  EmergencyContactsNotifier() : super(const []) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kKey);
    if (raw == null) return;
    final list = (jsonDecode(raw) as List)
        .map((e) => EmergencyContact.fromJson(e as Map<String, dynamic>))
        .toList();
    state = list;
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _kKey,
      jsonEncode(state.map((c) => c.toJson()).toList()),
    );
  }

  Future<void> add(EmergencyContact contact) async {
    if (state.length >= 3) return; // keep the emergency card scannable
    state = [...state, contact];
    await _persist();
  }

  Future<void> removeAt(int index) async {
    final next = [...state]..removeAt(index);
    state = next;
    await _persist();
  }
}

final emergencyContactsProvider =
    StateNotifierProvider<EmergencyContactsNotifier, List<EmergencyContact>>(
  (ref) => EmergencyContactsNotifier(),
);


