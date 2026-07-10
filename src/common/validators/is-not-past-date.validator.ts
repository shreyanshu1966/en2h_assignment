import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsNotPastDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotPastDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const inputDate = new Date(`${value}T00:00:00`);
          if (Number.isNaN(inputDate.getTime())) return false;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return inputDate.getTime() >= today.getTime();
        },
        defaultMessage() {
          return 'bookingDate cannot be in the past';
        },
      },
    });
  };
}
