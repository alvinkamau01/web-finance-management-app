/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SelectionModel } from '@angular/cdk/collections';
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
import { MatDialog } from '@angular/material/dialog';

/** Dialog Imports */
import { ConfirmationDialogComponent } from 'app/shared/confirmation-dialog/confirmation-dialog.component';

/** Custom Services */
import { TasksService } from '../../tasks.service';
import { SettingsService } from 'app/settings/settings.service';
import { Dates } from 'app/core/utils/dates';
import { TranslateService } from '@ngx-translate/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { MatCheckbox } from '@angular/material/checkbox';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { STANDALONE_SHARED_IMPORTS } from 'app/standalone-shared.module';
import { AuthenticationService } from 'app/core/authentication/authentication.service';
import { UsersService } from '../../../users/users.service';

@Component({
  selector: 'mifosx-loan-disbursal',
  templateUrl: './loan-disbursal.component.html',
  styleUrls: ['./loan-disbursal.component.scss'],
  imports: [
    ...STANDALONE_SHARED_IMPORTS,
    FaIconComponent,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCheckbox,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    FormatNumberPipe
  ]
})
export class LoanDisbursalComponent {
  /** Loans Data */
  loans: any;
  /** Batch Requests */
  batchRequests: any[];
  /** Datasource for loans disbursal table */
  dataSource: MatTableDataSource<any>;
  /** Row Selection */
  selection: SelectionModel<any>;
  /** Displayed Columns for loan disbursal data */
  displayedColumns: string[] = [
    'select',
    'client',
    'loanAccountNumber',
    'loanProduct',
    'principal'
  ];
  /** Flag to indicate if disbursement is in progress */
  isDisbursing: boolean = false;
  /** Messages for transfer status */
  transferMessages: string[] = [];
  /** Current user data */
  currentUser: any;
  /** Is current user a loan officer */
  isLoanOfficer = false;

  /**
   * Retrieves the loans data from `resolve`.
   * @param {ActivatedRoute} route Activated Route.
   * @param {Dialog} dialog MatDialog.
   * @param {Dates} dateUtils Date Utils.
   * @param {router} router Router.
   * @param {SettingsService} settingsService Settings Service.
   * @param {TasksService} tasksService Tasks Service.
   */
   constructor(
     private route: ActivatedRoute,
     private dialog: MatDialog,
     private dateUtils: Dates,
     private settingsService: SettingsService,
     private translateService: TranslateService,
     private tasksService: TasksService,
     private authenticationService: AuthenticationService,
     private usersService: UsersService
   ) {
     this.route.data.subscribe((data: { loansData: any }) => {
       this.loans = data.loansData.pageItems;
       this.loans = this.loans.filter((account: any) => {
         return account.status.waitingForDisbursal === true;
       });
       this.dataSource = new MatTableDataSource(this.loans);
       this.selection = new SelectionModel(true, []);
     });

     // Get current user data for loan officer filtering
     this.getCurrentUser();
   }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    this.isAllSelected()
      ? this.selection.clear()
      : this.dataSource.data.forEach((row: any) => this.selection.select(row));
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'select' : 'deselect'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
  }

  disburseLoan() {
    const disburseLoanDialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        heading: this.translateService.instant('labels.heading.Loan Disbursal and B2C Transfer'),
        dialogContext: this.translateService.instant('labels.dialogContext.Are you sure you want to Disburse Loan and initiate M-Pesa B2C transfer?')
      }
    });
    disburseLoanDialogRef.afterClosed().subscribe((response: { confirm: any }) => {
      if (response.confirm) {
        this.isDisbursing = true;
        this.transferMessages = [];
        this.bulkLoanDisbursal();
      }
    });
  }

  bulkLoanDisbursal() {
    const dateFormat = this.settingsService.dateFormat;
    const approvedOnDate = this.dateUtils.formatDate(new Date(), dateFormat);
    const locale = this.settingsService.language.code;
    const formData = {
      dateFormat,
      approvedOnDate,
      locale
    };
    const selectedAccounts = this.selection.selected.length;
    const listSelectedAccounts = this.selection.selected;
    let approvedAccounts = 0;
    this.batchRequests = [];
    let reqId = 1;
    listSelectedAccounts.forEach((element: any) => {
      const url = 'loans/' + element.id + '?command=disburse';
      const bodyData = JSON.stringify(formData);
      const batchData = { requestId: reqId++, relativeUrl: url, method: 'POST', body: bodyData };
      this.batchRequests.push(batchData);
    });
    this.tasksService.submitBatchData(this.batchRequests).subscribe((response: any) => {
      response.forEach((responseEle: any) => {
        if (responseEle.statusCode === '200') {
          approvedAccounts++;
          responseEle.body = JSON.parse(responseEle.body);
          if (selectedAccounts === approvedAccounts) {
            // After successful Mifos disbursement, initiate ph-ee transfer for each loan
            this.initiatePheeTransfers(listSelectedAccounts);
            this.loanResource();
          }
        }
      });
    });
  }

  initiatePheeTransfers(loans: any[]) {
    let completedTransfers = 0;
    const totalTransfers = loans.length;

    loans.forEach((loan: any) => {
      const transferData = {
        amount: loan.principal,
        currency: 'KES', // Assuming Kenyan Shilling; adjust as needed
        from: {
          accountId: 'lender-account-id', // Replace with actual lender account ID
          partyIdType: 'MSISDN',
          partyIdentifier: '254700000000' // Replace with lender's M-Pesa number
        },
        to: {
          accountId: loan.accountNo, // Use loan account number
          partyIdType: 'MSISDN',
          partyIdentifier: loan.mobileNo || '254711111111' // Replace with borrower's M-Pesa number; add to loan data if needed
        },
        transactionId: `disburse-${loan.id}-${Date.now()}`,
        note: `Loan disbursement for loan ${loan.id}`
      };
      this.tasksService.initiatePheeTransfer(transferData).subscribe({
        next: (response: any) => {
          console.log('ph-ee B2C transfer initiated successfully for loan', loan.id, response);
          this.transferMessages.push(`B2C Transfer initiated for loan ${loan.id} (${loan.clientName})`);
          completedTransfers++;
          if (completedTransfers === totalTransfers) {
            this.isDisbursing = false;
            this.transferMessages.push('All B2C transfers completed.');
          }
        },
        error: (error: any) => {
          console.error('ph-ee B2C transfer failed for loan', loan.id, error);
          this.transferMessages.push(`B2C Transfer failed for loan ${loan.id} (${loan.clientName}): ${error.message || 'Unknown error'}`);
          completedTransfers++;
          if (completedTransfers === totalTransfers) {
            this.isDisbursing = false;
            this.transferMessages.push('Some B2C transfers failed. Check logs for details.');
          }
        }
      });
    });
  }

  loanResource() {
    // Pass staff ID for loan officers to filter loans server-side
    const staffId = this.isLoanOfficer && this.currentUser && this.currentUser.staff ? this.currentUser.staff.id : undefined;
    this.tasksService.getAllLoansToBeDisbursed(staffId).subscribe((response: any) => {
      this.loans = response.pageItems;
      this.loans = this.loans.filter((account: any) => {
        return account.status.waitingForDisbursal === true;
      });
      // Additional client-side filtering as backup (in case server-side filtering fails)
      if (this.isLoanOfficer && this.currentUser && this.currentUser.staff) {
        this.loans = this.loans.filter((loan: any) => loan.staffId === this.currentUser.staff.id);
      }
      this.dataSource = new MatTableDataSource(this.loans);
      this.selection = new SelectionModel(true, []);
    });
  }

  /**
   * Gets the current user data and checks if loan officer.
   */
  getCurrentUser() {
    const credentials = this.authenticationService.getCredentials();
    this.usersService.getUser(credentials.userId.toString()).subscribe((user: any) => {
      this.currentUser = user;
      this.isLoanOfficer = user.staff && user.staff.isLoanOfficer;
      // Refilter existing data if user is loan officer
      if (this.isLoanOfficer && this.dataSource.data.length > 0) {
        this.dataSource.data = this.dataSource.data.filter((loan: any) => loan.staffId === this.currentUser.staff.id);
      }
    });
  }

  applyFilter(filterValue: string = '') {
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
}
