import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { MasterDataService } from '../../application/master-data.service';
import { SheetsStore } from '../../infrastructure/sheets.store';

@Component({
  selector: 'app-company-info',
  standalone: true,
  imports: [],
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
  protected readonly ready = this.masterData.ready;

  private readonly sheetId = signal<string | null>(null);
  /** Outward link to the source spreadsheet; null until the id resolves. */
  protected readonly sheetUrl = computed(() => {
    const id = this.sheetId();
    return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
  });

  ngOnInit(): void {
    if (!this.ready() && !this.loading() && this.error() === null) {
      void this.masterData.load();
    }
    void this.sheets
      .resolveSupportingSheetId()
      .then(id => this.sheetId.set(id))
      .catch(() => this.sheetId.set(null));
  }
}
