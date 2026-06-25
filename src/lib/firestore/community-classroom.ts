import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Course, CourseSection, Lesson } from "@/types/community";

/**
 * Client-side subscriptions for the STAFF classroom builder (staff are Firebase
 * users; rules allow member-scoped reads of communityGroups/**). All writes go
 * through the Admin-SDK routes. Members never use these — their player is
 * server-rendered.
 */

function coursesPath(saId: string, groupId: string) {
  return `subAccounts/${saId}/communityGroups/${groupId}/courses`;
}

export function subscribeToCourses(
  saId: string,
  groupId: string,
  cb: (courses: Course[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), coursesPath(saId, groupId)),
    (snap) => {
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Course, "id">) }))
          .sort((a, b) => a.order - b.order),
      );
    },
    (e) => onError?.(e),
  );
}

export function subscribeToCourse(
  saId: string,
  groupId: string,
  courseId: string,
  cb: (course: Course | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), `${coursesPath(saId, groupId)}/${courseId}`),
    (snap) => {
      cb(
        snap.exists()
          ? { id: snap.id, ...(snap.data() as Omit<Course, "id">) }
          : null,
      );
    },
    (e) => onError?.(e),
  );
}

export function subscribeToSections(
  saId: string,
  groupId: string,
  courseId: string,
  cb: (sections: CourseSection[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), `${coursesPath(saId, groupId)}/${courseId}/sections`),
      orderBy("order", "asc"),
    ),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseSection, "id">) })));
    },
    (e) => onError?.(e),
  );
}

export function subscribeToLessons(
  saId: string,
  groupId: string,
  courseId: string,
  cb: (lessons: Lesson[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), `${coursesPath(saId, groupId)}/${courseId}/lessons`),
      orderBy("order", "asc"),
    ),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lesson, "id">) })));
    },
    (e) => onError?.(e),
  );
}
