import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbModal, NgbPagination } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../../core/services/auth.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import { Role } from '../../../types/auth.types';
import { ManagedUser } from '../../../types/user-management.types';
import { NewUserModal } from './new-user-modal/new-user-modal';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-user-list',
  imports: [DatePipe, NgbPagination],
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
})
export class UserList implements OnInit {
  private readonly userManagementService = inject(UserManagementService);
  private readonly modal = inject(NgbModal);
  readonly authService = inject(AuthService);

  readonly loading = signal(true);
  readonly users = signal<ManagedUser[]>([]);
  readonly totalCount = signal(0);
  readonly roleFilter = signal<Role | 'All'>('All');
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;

  readonly roles: Role[] = ['Customer', 'SupportAgent', 'Admin'];

  ngOnInit(): void {
    this.load();
  }

  onRoleFilterChange(value: Role | 'All'): void {
    this.roleFilter.set(value);
    this.page.set(1);
    this.load();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  openNewUserModal(): void {
    const modalRef = this.modal.open(NewUserModal);
    modalRef.result.then(
      () => this.load(),
      () => undefined,
    );
  }

  changeRole(user: ManagedUser, role: Role): void {
    if (role === user.role || this.isSelf(user)) {
      return;
    }

    this.userManagementService.changeRole(user.id, { role }).subscribe({
      next: () => this.load(),
    });
  }

  toggleActive(user: ManagedUser): void {
    if (this.isSelf(user)) {
      return;
    }

    this.userManagementService.setActive(user.id, { isActive: !user.isActive }).subscribe({
      next: () => this.load(),
    });
  }

  isSelf(user: ManagedUser): boolean {
    return user.id === this.authService.currentUser()?.id;
  }

  private load(): void {
    this.loading.set(true);
    const roleFilter = this.roleFilter();
    this.userManagementService
      .list(roleFilter === 'All' ? undefined : roleFilter, this.page(), this.pageSize)
      .subscribe({
        next: (result) => {
          this.users.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
