import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Audit, AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreatePatientDto, PatientsService } from './patients.service';

@ApiTags('patients') @ApiBearerAuth() @Audit('PATIENT')
@Roles(Role.DOCTOR, Role.PHARMACIST, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN, Role.EXECUTIVE)
@Controller('patients')
export class PatientsController {
  constructor(private svc: PatientsService) {}

  @Get() search(@CurrentUser() u: AuthUser, @Query('q') q?: string) { return this.svc.search(q?.slice(0, 100), u.role); }
  @Get('documents/:docId/file') @Roles(Role.DOCTOR, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.ADMIN) getDocumentFile(@Param('docId', ParseUUIDPipe) docId: string) { return this.svc.getDocumentFile(docId); }
  @Patch('documents/:docId/review') @Roles(Role.DOCTOR, Role.ADMIN) reviewDocument(@Param('docId', ParseUUIDPipe) docId: string, @CurrentUser() u: AuthUser) { return this.svc.reviewDocument(docId, u.id); }
  @Get(':id/documents') @Roles(Role.DOCTOR, Role.LAB_TECH, Role.HOSPITAL_STAFF, Role.ADMIN) listDocuments(@Param('id', ParseUUIDPipe) id: string) { return this.svc.listDocuments(id); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.get(id, u.role); }
  @Post() @Roles(Role.DOCTOR, Role.HOSPITAL_STAFF, Role.RECEPTIONIST, Role.ADMIN) create(@Body() dto: CreatePatientDto) { return this.svc.create(dto); }
}
