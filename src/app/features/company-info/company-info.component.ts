import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MasterDataService } from '../../application/master-data.service';

@Component({
  selector: 'app-company-info',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './company-info.component.html',
  styleUrl: './company-info.component.scss',
})
export class CompanyInfoComponent implements OnInit {
  private readonly masterData = inject(MasterDataService);

  protected readonly company = this.masterData.company;
  protected readonly vehicle = this.masterData.vehicle;
  protected readonly loading = this.masterData.loading;
  protected readonly error = this.masterData.error;
  protected readonly ready = this.masterData.ready;

  ngOnInit(): void {
    if (!this.ready() && !this.loading() && this.error() === null) {
      void this.masterData.load();
    }
  }
}
