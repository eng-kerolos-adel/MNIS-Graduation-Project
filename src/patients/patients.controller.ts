import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreatePatientDto, PatientsService } from './patients.service';

@ApiTags('patients') @ApiBearerAuth() @Audit('PATIENT')
@Roles(Role.DOCTOR, Role.PHARMACIST, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN, Role.EXECUTIVE)
@Controller('patients')
export class PatientsController {
  constructor(private svc: PatientsService) {}

  @Get() search(@Query('q') q?: string) { return this.svc.search(q?.slice(0, 100)); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u.role); }
  @Post() @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN) create(@Body() dto: CreatePatientDto) { return this.svc.create(dto); }
}
