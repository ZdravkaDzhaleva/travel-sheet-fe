export type LocationType = 'Office' | 'Constructor' | 'Architect' | 'Project' | 'Control';

export interface Location {
  readonly Id: number;
  readonly CompanyId: number;
  readonly Name: string;
  readonly Type: LocationType;
  readonly NameBg: string; // written into the route string in the workbook
  readonly Address: string;
}
