/** Angular Imports. */
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSort, Sort, MatSortHeader } from '@angular/material/sort';
import {
  MatTableDataSource,
  MatTable,
  MatColumnDef,
  MatHeaderCellDef,
  MatHeaderCell,
  MatCellDef,
  MatCell,
  MatHeaderRowDef,
  MatHeaderRow,
  MatRowDef,
  MatRow
} from '@angular/material/table';

/** Custom Services */
import { environment } from '../../environments/environment';
import { ClientsService } from './clients.service';
import { AuthenticationService } from 'app/core/authentication/authentication.service';
import { UsersService } from '../users/users.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { NgIf, NgClass } from '@angular/common';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { MatProgressBar } from '@angular/material/progress-bar';
import { AccountNumberComponent } from '../shared/account-number/account-number.component';
import { ExternalIdentifierComponent } from '../shared/external-identifier/external-identifier.component';
import { StatusLookupPipe } from '../pipes/status-lookup.pipe';
import { STANDALONE_SHARED_IMPORTS } from 'app/standalone-shared.module';

@Component({
  selector: 'mifosx-clients',
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.scss'],
  imports: [
    ...STANDALONE_SHARED_IMPORTS,
    MatCheckbox,
    FaIconComponent,
    MatProgressBar,
    MatTable,
    MatSort,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatSortHeader,
    MatCellDef,
    MatCell,
    AccountNumberComponent,
    ExternalIdentifierComponent,
    NgClass,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatPaginator,
    StatusLookupPipe
  ]
})
export class ClientsComponent implements OnInit {
  @ViewChild('showClosedAccounts') showClosedAccounts: MatCheckbox;

  displayedColumns = [
    'displayName',
    'accountNumber',
    'externalId',
    'status',
    'officeName'
  ];
  dataSource: MatTableDataSource<any> = new MatTableDataSource();

  existsClientsToFilter = false;
  notExistsClientsToFilter = false;

  totalRows: number;
  isLoading = false;

  pageSize = 50;
  currentPage = 0;
  filterText = '';

  sortAttribute = '';
  sortDirection = '';

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  /** Current user data */
  currentUser: any;
  /** Is current user a loan officer */
  isLoanOfficer = false;
  /** User role for access control */
  userRole: string = 'admin';

  constructor(
    private clientService: ClientsService,
    private authenticationService: AuthenticationService,
    private usersService: UsersService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.getCurrentUser();
    // Always load clients, not just when preloadClients is true
    // This ensures loan officers can see their assigned clients
    // Initial load without staff filtering, will be filtered when user data arrives
    this.getClients();
  }

  /**
   * Gets the current user data and checks if loan officer.
   */
  getCurrentUser() {
    const credentials = this.authenticationService.getCredentials();
    this.usersService.getUser(credentials.userId.toString()).subscribe((user: any) => {
      this.currentUser = user;
      this.isLoanOfficer = user.staff && user.staff.isLoanOfficer;
      // Reload clients with proper filtering after getting user data
      this.getClients();
    });
  }

  /**
   * Searches server for query and resource.
   */
  search(value: string) {
    this.filterText = value;
    this.resetPaginator();
    this.getClients();
  }

  private getClients() {
    this.isLoading = true;
    // Only apply staff filtering if we have user data and user is a loan officer
    const staffId = (this.currentUser && this.currentUser.staff && this.isLoanOfficer) ? this.currentUser.staff.id : undefined;
    console.log('Loading clients with staffId:', staffId, 'isLoanOfficer:', this.isLoanOfficer, 'currentUser:', this.currentUser);

    // Use the search API for both admins and loan officers (now includes staffId)
    console.log('Using search API for all users (now includes staffId)');
    this.clientService
      .searchByText(this.filterText, this.currentPage, this.pageSize, this.sortAttribute, this.sortDirection, staffId)
      .subscribe(
        (data: any) => {
          let clients = data.content;
          console.log('Received clients data from search API:', data);
          console.log('Clients before filtering:', clients.length);
          console.log('Sample client staffId values:', clients.slice(0, 3).map((c: any) => ({ id: c.id, staffId: c.staffId, hasStaffId: c.hasOwnProperty('staffId') })));

          // Server-side filtering should now handle staff filtering, but keep as backup
          if (this.currentUser && this.currentUser.staff && this.isLoanOfficer) {
            console.log('Loan officer - checking if server-side filtering worked');
            console.log('Current user staffId:', this.currentUser.staff.id);
            console.log('Clients returned:', clients.map((c: any) => ({id: c.id, staffId: c.staffId})));
          }

          this.dataSource.data = clients;
          this.totalRows = data.totalElements;
          this.existsClientsToFilter = data.numberOfElements > 0;
          this.notExistsClientsToFilter = !this.existsClientsToFilter;
          this.isLoading = false;
        },
        (error: any) => {
          console.error('Error loading clients:', error);
          this.isLoading = false;
        }
      );
  }

  pageChanged(event: PageEvent) {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
    this.getClients();
  }

  sortChanged(event: Sort) {
    if (event.direction === '') {
      this.sortDirection = '';
      this.sortAttribute = '';
    } else {
      this.sortAttribute = event.active;
      this.sortDirection = event.direction;
    }
    this.resetPaginator();
    this.getClients();
  }

  private resetPaginator() {
    this.currentPage = 0;
    this.paginator.firstPage();
  }
}
