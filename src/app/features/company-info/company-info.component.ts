import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { MasterDataService } from '../../application/master-data.service';
import { SheetsStore } from '../../infrastructure/sheets.store';
import { ErrorAlertComponent } from '../../shared/ui/error-alert/error-alert.component';

@Component({
  selector: 'app-company-info',
  imports: [ErrorAlertComponent],
  templateUrl: './company-info.component.html',
  styleUrl: './company-info.component.scss',
})
export class CompanyInfoComponent implements OnInit {
  private readonly masterData = inject(MasterDataService);
  private readonly sheets = inject(SheetsStore);

  protected readonly company = this.masterData.company;
  protected readonly vehicle = this.masterData.vehicle;
  protected readonly loading = this.masterData.loading;
  protected readonly error = this.masterData.error;

  /** Row counts for the two skeleton cards (Company / Active vehicle). */
  protected readonly skeletonCards: readonly (readonly number[])[] = [
    [0, 1, 2, 3],
    [0, 1, 2, 3, 4, 5, 6],
  ];

  private readonly sheetId = signal<string | null>(null);
  /** Outward link to the source spreadsheet; null until the id resolves. */
  protected readonly sheetUrl = computed(() => {
    const id = this.sheetId();
    return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
  });

  ngOnInit(): void {
    void this.masterData.ensureLoaded();
    this.resolveSheetLink();
  }

  /** User-initiated retry forces the Google consent prompt to recover scopes. */
  protected retry(): void {
    void this.masterData.load({ forceConsent: true }).catch(() => undefined);
    // The supporting-sheet id may have failed to resolve too; re-attempt so the
    // outward link lights up once the underlying issue is fixed.
    this.resolveSheetLink();
  }

  private resolveSheetLink(): void {
    void this.sheets
      .resolveSupportingSheetId()
      .then(id => this.sheetId.set(id))
      .catch(() => this.sheetId.set(null));
  }
}
