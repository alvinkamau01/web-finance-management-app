/** Angular Imports */
import { Component, OnInit } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

/** Custom Services */
import { ClientsService } from 'app/clients/clients.service';
import { AuthenticationService } from 'app/core/authentication/authentication.service';
import { UsersService } from 'app/users/users.service';
import { Dates } from 'app/core/utils/dates';
import { SettingsService } from 'app/settings/settings.service';
import { STANDALONE_SHARED_IMPORTS } from 'app/standalone-shared.module';

/**
 * Activate Client Component
 */
@Component({
  selector: 'mifosx-activate-client',
  templateUrl: './activate-client.component.html',
  styleUrls: ['./activate-client.component.scss'],
  imports: [
    ...STANDALONE_SHARED_IMPORTS
  ]
})
export class ActivateClientComponent implements OnInit {
  /** Minimum date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum date allowed. */
  maxDate = new Date();
  /** Activate client form. */
  activateClientForm: UntypedFormGroup;
  /** Client Id */
  clientId: any;
  /** Client data */
  clientData: any;
  /** Current user data */
  currentUser: any;
  /** Is current user a loan officer */
  isLoanOfficer = false;

  /**
    * @param {FormBuilder} formBuilder Form Builder
    * @param {clientsService} clientsService Cliens Service
    * @param {AuthenticationService} authenticationService Authentication Service
    * @param {UsersService} usersService Users Service
    * @param {Dates} dateUtils Date Utils
    * @param {ActivatedRoute} route Activated Route
    * @param {Router} router Router
    * @param {SettingsService} settingsService Settings Service
    */
   constructor(
     private formBuilder: UntypedFormBuilder,
     private clientsService: ClientsService,
     private authenticationService: AuthenticationService,
     private usersService: UsersService,
     private dateUtils: Dates,
     private route: ActivatedRoute,
     private router: Router,
     private settingsService: SettingsService
   ) {
     this.clientId = this.route.parent.snapshot.params['clientId'];
   }

  /**
   * Creates the activate client form and fetches user and client data.
   */
  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;
    this.createActivateClientForm();
    this.getCurrentUser();
    this.getClientData();
  }

  /**
   * Gets the current user data.
   */
  getCurrentUser() {
    const credentials = this.authenticationService.getCredentials();
    this.usersService.getUser(credentials.userId.toString()).subscribe((user: any) => {
      this.currentUser = user;
      this.isLoanOfficer = user.staff && user.staff.isLoanOfficer;
    });
  }

  /**
   * Gets the client data.
   */
  getClientData() {
    this.clientsService.getClientData(this.clientId).subscribe((client: any) => {
      this.clientData = client;
    });
  }

  /**
   * Creates the activate client form.
   */
  createActivateClientForm() {
    this.activateClientForm = this.formBuilder.group({
      activationDate: [
        '',
        Validators.required
      ]
    });
  }

  /**
   * Submits the form and activates the client,
   * if successful redirects to the client.
   */
  submit() {
    if (this.isLoanOfficer && this.clientData && this.currentUser && this.currentUser.staff && this.clientData.staffId !== this.currentUser.staff.id) {
      alert('You can only activate clients assigned to you.');
      return;
    }
    const activateClientFormData = this.activateClientForm.value;
    const locale = this.settingsService.language.code;
    const dateFormat = this.settingsService.dateFormat;
    const prevActivationDate: Date = this.activateClientForm.value.activationDate;
    if (activateClientFormData.activationDate instanceof Date) {
      activateClientFormData.activationDate = this.dateUtils.formatDate(prevActivationDate, dateFormat);
    }
    const data = {
      ...activateClientFormData,
      dateFormat,
      locale
    };
    console.log('Activating client with data:', data);
    this.clientsService.executeClientCommand(this.clientId, 'activate', data).subscribe(() => {
      this.router.navigate(['../../'], { relativeTo: this.route });
    }, (error: any) => {
      console.error('Error activating client:', error);
      alert('Failed to activate client: ' + (error.error?.defaultUserMessage || error.message || 'Unknown error'));
    });
  }
}
