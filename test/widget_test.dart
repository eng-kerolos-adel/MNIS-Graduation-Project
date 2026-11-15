// Minimal smoke test: the app boots without throwing. The original template
// test asserted a counter UI that this app never had.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mnis_app/main.dart';

void main() {
  testWidgets('MnisApp builds without throwing', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: MnisApp()));
    // The splash screen's session bootstrap makes a real network call, which
    // has no server to answer in a test environment — just let one frame
    // settle instead of pumpAndSettle (which would wait for a timeout).
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(MaterialApp).evaluate().isNotEmpty || find.byType(WidgetsApp).evaluate().isNotEmpty, isTrue);
  });
}
