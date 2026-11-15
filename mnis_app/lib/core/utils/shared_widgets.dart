import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart' show SvgPicture;
import '../theme/app_colors.dart';

/// MNIS Shield logo rendered from SVG string (no assets needed)
class MnisShieldLogo extends StatelessWidget {
  final double size;
  const MnisShieldLogo({super.key, this.size = 32});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _ShieldPainter()),
    );
  }
}

class _ShieldPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Background rounded rect
    final bgPaint = Paint()..color = AppColors.primaryContainer;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, w, h),
          Radius.circular(w * 0.24)),
      bgPaint,
    );

    // Shield body
    final shieldFill = Paint()
      ..color = AppColors.secondary.withOpacity(0.25);
    final shieldBorder = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.03;

    final shieldPath = Path();
    final cx = w / 2;
    final startY = h * 0.16;
    shieldPath.moveTo(cx, startY);
    shieldPath.lineTo(w * 0.78, h * 0.28);
    shieldPath.lineTo(w * 0.78, h * 0.48);
    shieldPath.quadraticBezierTo(w * 0.78, h * 0.66, cx, h * 0.86);
    shieldPath.quadraticBezierTo(w * 0.22, h * 0.66, w * 0.22, h * 0.48);
    shieldPath.lineTo(w * 0.22, h * 0.28);
    shieldPath.close();
    canvas.drawPath(shieldPath, shieldFill);
    canvas.drawPath(shieldPath, shieldBorder);

    // Cross (health symbol)
    final crossPaint = Paint()
      ..color = Colors.white
      ..strokeWidth = w * 0.07
      ..strokeCap = StrokeCap.round;

    // Vertical
    canvas.drawLine(
        Offset(cx, h * 0.32), Offset(cx, h * 0.68), crossPaint);
    // Horizontal
    canvas.drawLine(
        Offset(w * 0.32, h * 0.5), Offset(w * 0.68, h * 0.5), crossPaint);

    // Center dot (emerald)
    final dotPaint = Paint()..color = const Color(0xFF00B894);
    canvas.drawCircle(Offset(cx, h * 0.5), w * 0.025, dotPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Pill / Badge chip with custom color
class StatusBadge extends StatelessWidget {
  final String label;
  final Color backgroundColor;
  final Color textColor;
  final IconData? icon;
  final double fontSize;

  const StatusBadge({
    super.key,
    required this.label,
    required this.backgroundColor,
    required this.textColor,
    this.icon,
    this.fontSize = 11,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(9999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: textColor),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: textColor,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

/// Animated pulsing dot
class PulsingDot extends StatefulWidget {
  final Color color;
  final double size;
  const PulsingDot({super.key, required this.color, this.size = 8});

  @override
  State<PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<PulsingDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _anim = Tween(begin: 0.4, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: widget.color.withOpacity(_anim.value),
        ),
      ),
    );
  }
}

/// Gradient medical card background
class MedicalCardGradient extends StatelessWidget {
  final Widget child;
  final double borderRadius;

  const MedicalCardGradient({
    super.key,
    required this.child,
    this.borderRadius = 16,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(borderRadius),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            AppColors.primaryContainer,
            AppColors.primary,
            Color(0xFF0F2D48),
          ],
          stops: [0.0, 0.5, 1.0],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.35),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}


